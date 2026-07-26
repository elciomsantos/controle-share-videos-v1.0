import {
  Button,
  Center,
  Container,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Link from "next/link";
import Logo from "../../components/Logo";
import Meta from "../../components/Meta";

const Intro = () => {
  return (
    <>
      <Meta title="Intro" />
      <Container size="xs">
        <Stack>
          <Center>
            <Logo height={100} width={100} />
          </Center>
          <Center>
            <Title order={2}>Guarda Municipal de Londrina</Title>
          </Center>
          <Text>Sistema de Controle e compartilhamento de Videos!</Text>
          <Text mt="lg">Faça login no sistema para continuar</Text>
          <Stack>
            <Button href="/admin/config/general" component={Link}>
              Customize configuration
            </Button>
            <Button href="/" component={Link} variant="light">
              Explore Controle Share Videos
            </Button>
          </Stack>
        </Stack>
      </Container>
    </>
  );
};

export default Intro;


